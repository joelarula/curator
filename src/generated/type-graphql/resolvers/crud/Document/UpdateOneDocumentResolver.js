"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateOneDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const UpdateOneDocumentArgs_1 = require("./args/UpdateOneDocumentArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let UpdateOneDocumentResolver = class UpdateOneDocumentResolver {
    async updateOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.UpdateOneDocumentResolver = UpdateOneDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneDocumentArgs_1.UpdateOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], UpdateOneDocumentResolver.prototype, "updateOneDocument", null);
exports.UpdateOneDocumentResolver = UpdateOneDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], UpdateOneDocumentResolver);
