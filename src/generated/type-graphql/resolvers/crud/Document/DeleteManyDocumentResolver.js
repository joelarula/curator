"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteManyDocumentArgs_1 = require("./args/DeleteManyDocumentArgs");
const Document_1 = require("../../../models/Document");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let DeleteManyDocumentResolver = class DeleteManyDocumentResolver {
    async deleteManyDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteManyDocumentResolver = DeleteManyDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyDocumentArgs_1.DeleteManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteManyDocumentResolver.prototype, "deleteManyDocument", null);
exports.DeleteManyDocumentResolver = DeleteManyDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], DeleteManyDocumentResolver);
