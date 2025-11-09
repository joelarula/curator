"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOneDocumentResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const CreateOneDocumentArgs_1 = require("./args/CreateOneDocumentArgs");
const Document_1 = require("../../../models/Document");
const helpers_1 = require("../../../helpers");
let CreateOneDocumentResolver = class CreateOneDocumentResolver {
    async createOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.CreateOneDocumentResolver = CreateOneDocumentResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneDocumentArgs_1.CreateOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], CreateOneDocumentResolver.prototype, "createOneDocument", null);
exports.CreateOneDocumentResolver = CreateOneDocumentResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], CreateOneDocumentResolver);
